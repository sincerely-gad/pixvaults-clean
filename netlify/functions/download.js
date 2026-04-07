const pool = require('./db')

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

  if (!row.product_slug) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Missing product slug for this payment' })
    }
  }

  const downloadUrl = `https://www.pixvaults.com/downloads/${encodeURIComponent(row.product_slug)}.zip`

  // Increment attempts before redirecting so download attempts are still enforced.
  await pool.query(
    `UPDATE download_tokens SET attempts_used = attempts_used + 1 WHERE id = $1`,
    [row.token_id]
  )

  return {
    statusCode: 302,
    headers: {
      Location: downloadUrl
    },
    body: ''
  }
}
