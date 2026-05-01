const pool = require('./db')

const PACKS = {
  emma_lyla: 10,
  jenna_ortega: 14.99,
  zendaya: 14.99,
  ariana_nurse: 10,
  sedney: 14.99,
  flora: 10,
  emma_meyers: 14.99,
  nina: 14.99,
  kitty: 10,
  emma_jenna: 19.99,
  zendaya_sedney: 19.99,
  emma_zendaya: 19.99,
  nina_sedney: 19.99,
  jenna_nina: 19.99,
  jenna_zendaya: 19.99,
  emma_sedney: 19.99,
  of_collection: 32.50
}

exports.handler = async (event) => {
  const pack = event.queryStringParameters.pack
  const email = event.queryStringParameters.email || null

  if (!PACKS[pack]) {
    return { statusCode: 400, body: 'Invalid pack' }
  }

  const priceAmount = PACKS[pack]
  const orderId = Date.now() + '_' + pack

  const invoiceRes = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.NOWPAYMENTS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      price_amount: priceAmount,
      price_currency: 'usd',
      order_id: orderId,
      order_description: pack,
      success_url: `https://pixvaults.com/success.html?order_id=${orderId}`,
      ipn_callback_url: `https://pixvaults.com/.netlify/functions/ipn`
    })
  })

  const invoice = await invoiceRes.json()

  if (!invoice.invoice_url) {
    console.error('NowPayments invoice creation failed:', invoice)
    return { statusCode: 502, body: 'Payment provider error' }
  }

  await pool.query(
    `INSERT INTO payments
       (product_slug, buyer_email, nowpayments_payment_id, price_amount, payment_status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [pack, email, orderId, priceAmount]
  )

  return {
    statusCode: 302,
    headers: { Location: invoice.invoice_url }
  }
}
