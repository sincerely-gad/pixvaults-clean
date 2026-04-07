const pool = require('./db')

exports.handler = async (event) => {
  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const { payment_id, payment_status, order_id, pay_amount, pay_currency } = body

  if (!order_id || !payment_status) {
    return { statusCode: 400, body: 'Missing fields' }
  }

  await pool.query(
    `UPDATE payments
     SET payment_status        = $1,
         pay_amount            = $2,
         pay_currency          = $3,
         nowpayments_payment_id = COALESCE($4::varchar, nowpayments_payment_id),
         updated_at            = CURRENT_TIMESTAMP
     WHERE nowpayments_payment_id = $5`,
    [payment_status, pay_amount || null, pay_currency || null, payment_id ? String(payment_id) : null, order_id]
  )

  return { statusCode: 200 }
}
