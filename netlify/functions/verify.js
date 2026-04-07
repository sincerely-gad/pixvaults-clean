const crypto = require('crypto')
const pool = require('./db')

exports.handler = async (event) => {
  const orderId = event.queryStringParameters.order_id

  if (!orderId) {
    return { statusCode: 400, body: 'Missing order_id' }
  }

  const result = await pool.query(
    `SELECT id, product_slug, payment_status
     FROM payments
     WHERE nowpayments_payment_id = $1
     LIMIT 1`,
    [orderId]
  )

  const payment = result.rows[0]

  if (!payment) {
    return { statusCode: 404, body: 'Payment not found' }
  }

  if (payment.payment_status !== 'finished') {
    return {
      statusCode: 402,
      body: JSON.stringify({ status: payment.payment_status })
    }
  }

  // Check for an existing valid token for this payment
  const existing = await pool.query(
    `SELECT token FROM download_tokens
     WHERE payment_id = $1
       AND expires_at > NOW()
       AND is_revoked = FALSE
     LIMIT 1`,
    [payment.id]
  )

  let token
  if (existing.rows.length > 0) {
    token = existing.rows[0].token
  } else {
    token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now

    await pool.query(
      `INSERT INTO download_tokens (payment_id, token, expires_at, max_attempts)
       VALUES ($1, $2, $3, 3)`,
      [payment.id, token, expiresAt]
    )
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'finished',
      product_slug: payment.product_slug,
      download_token: token
    })
  }
}
