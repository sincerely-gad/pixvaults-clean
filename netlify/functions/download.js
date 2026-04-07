const fs = require('fs')
const path = require('path')
const pool = require('./db')

const ZIP_FILES = {
  emma_lyla:     'emma_lyla.zip',
  jenna_ortega:  'jenna_ortega.zip',
  zendaya:       'zendaya.zip',
  ariana_nurse:  'ariana_nurse.zip',
  sedney:        'sedney.zip',
  flora:         'flora.zip',
  emma_meyers:   'emma_meyers.zip',
  nina:          'nina.zip',
  kitty:         'kitty.zip',
  emma_jenna:    'emma_jenna.zip',
  zendaya_sedney:'zendaya_sedney.zip',
  emma_zendaya:  'emma_zendaya.zip',
  nina_sedney:   'nina_sedney.zip',
  jenna_nina:    'jenna_nina.zip',
  jenna_zendaya: 'jenna_zendaya.zip',
  emma_sedney:   'emma_sedney.zip',
  of_collection: 'of_collection.zip'
}

// Resolves to <project-root>/downloads/ regardless of where Node is invoked from
const DOWNLOADS_DIR = path.join(__dirname, '..', '..', 'downloads')

exports.handler = async (event) => {
  const token = event.queryStringParameters.token

  if (!token) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Missing token' })
    }
  }

  const result = await pool.query(
    `SELECT
       dt.id            AS token_id,
       dt.token,
       dt.expires_at,
       dt.is_revoked,
       dt.attempts_used,
       dt.max_attempts,
       p.id             AS payment_id,
       p.product_slug,
       p.payment_status
     FROM download_tokens dt
     JOIN payments p ON p.id = dt.payment_id
     WHERE dt.token = $1
     LIMIT 1`,
    [token]
  )

  const row = result.rows[0]

  if (!row) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Invalid token' })
    }
  }

  if (row.is_revoked) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Token has been revoked' })
    }
  }

  if (new Date(row.expires_at) <= new Date()) {
    return {
      statusCode: 410,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Token has expired' })
    }
  }

  if (row.attempts_used >= row.max_attempts) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Download limit reached' })
    }
  }

  if (row.payment_status !== 'finished') {
    return {
      statusCode: 402,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Payment not completed' })
    }
  }

  const zipFilename = ZIP_FILES[row.product_slug]
  if (!zipFilename) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'No ZIP mapped for this product' })
    }
  }

  const zipPath = path.join(DOWNLOADS_DIR, zipFilename)
  if (!fs.existsSync(zipPath)) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'ZIP file not found on server' })
    }
  }

  // Increment attempts before serving — prevents retrying on partial downloads
  await pool.query(
    `UPDATE download_tokens SET attempts_used = attempts_used + 1 WHERE id = $1`,
    [row.token_id]
  )

  const fileBuffer = fs.readFileSync(zipPath)

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
      'Content-Length': String(fileBuffer.length)
    },
    body: fileBuffer.toString('base64'),
    isBase64Encoded: true
  }
}
