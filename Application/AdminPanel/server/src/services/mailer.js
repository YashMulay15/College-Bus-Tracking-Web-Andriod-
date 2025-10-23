import nodemailer from 'nodemailer'

const host = process.env.SMTP_HOST
const port = Number(process.env.SMTP_PORT || 587)
const user = process.env.SMTP_USER
const pass = process.env.SMTP_PASS
const from = process.env.SMTP_FROM || user

let transporter = null

export function getTransporter(){
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    })
  }
  return transporter
}

export async function sendCredentialsMail(to, subject, { name, username, password }){
  const t = getTransporter()
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
      <h2 style="margin:0 0 8px;color:#18397A">${subject}</h2>
      <p>Dear ${name || 'User'},</p>
      <p>Your account has been created. Use the following credentials to log in:</p>
      <ul>
        <li><strong>Username:</strong> ${username}</li>
        <li><strong>Password:</strong> ${password}</li>
      </ul>
      <p>Please change your password after logging in.</p>
      <p style="color:#666">This is an automated message. Do not reply.</p>
    </div>
  `
  const text = `Credentials\nUsername: ${username}\nPassword: ${password}\n`
  await t.sendMail({ from, to, subject, text, html })
}

export async function sendPassReminderMail(to, { studentName, expiryDate, type }){
  const t = getTransporter()
  const safeName = studentName || 'Student'
  const exp = expiryDate || ''

  let subject = 'Bus Pass Renewal Reminder'
  let html = ''
  let text = ''

  if (type === 'expired') {
    subject = 'Bus Pass Expiration Notice – Immediate Renewal Required'
    html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
        <h2 style="margin:0 0 8px;color:#18397A">${subject}</h2>
        <p>Dear ${safeName},</p>
        <p>Our records indicate that your bus pass expired on <strong>${exp}</strong>.</p>
        <p>To continue availing transport services, please visit the Transport Office at KITCOEK to complete the renewal process at the earliest.</p>
        <p>Kindly note that transport privileges remain suspended until the pass is renewed.</p>
        <p>If you have already renewed your pass, please disregard this message.</p>
        <p>Thank you for your prompt attention.</p>
        <p>— Transport Office<br/>KITCOEK</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
        <div style="font-size:12px;color:#777">This is an automated notice. Do not reply.</div>
      </div>
    `
    text = `Subject: ${subject}\n\nDear ${safeName},\nOur records indicate that your bus pass expired on ${exp}.\nTo continue availing transport services, please visit the Transport Office at KITCOEK to complete the renewal process at the earliest.\nKindly note that transport privileges remain suspended until the pass is renewed.\nIf you have already renewed your pass, please disregard this message.\nThank you for your prompt attention.\n— Transport Office\nKITCOEK\n`
  } else {
    subject = 'Bus Pass Renewal Reminder'
    html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
        <h2 style="margin:0 0 8px;color:#18397A">${subject}</h2>
        <p>Dear ${safeName},</p>
        <p>Your bus pass is set to expire on <strong>${exp}</strong>.</p>
        <p>Please complete your bus pass renewal at the respective office of the institute before this date.</p>
        <p>Failure to renew may result in suspension of your transport privileges.</p>
        <p>— Transport Office, KITCOEK</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
        <div style="font-size:12px;color:#777">This is an automated ${type||'reminder'} email. Do not reply.</div>
      </div>
    `
    text = `Dear ${safeName},\nYour bus pass is set to expire on ${exp}.\nPlease complete your bus pass renewal at the respective office of the institute before this date.\nFailure to renew may result in suspension of your transport privileges.\n— Transport Office, KITCOEK\n`
  }

  await t.sendMail({ from, to, subject, text, html })
}
