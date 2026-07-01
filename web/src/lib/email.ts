import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // STARTTLS on port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

/**
 * Send a one-time password email to the given recipient.
 */
export async function sendOtpEmail(to: string, name: string, otp: string): Promise<void> {
  const expiryMinutes = process.env.OTP_EXPIRES_MINUTES ?? '10'

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IMS Authentication Code</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0a0f1e; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 40px auto; background-color: #0d1730; border: 1px solid #1e3a5f; border-radius: 8px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #0a1628 0%, #1a3a5c 100%); padding: 32px 40px; text-align: center; border-bottom: 2px solid #1e8fff; }
    .header-title { color: #1e8fff; font-size: 13px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; margin: 0 0 8px; }
    .header-subtitle { color: #e2e8f0; font-size: 22px; font-weight: 600; margin: 0; }
    .body { padding: 40px; }
    .greeting { color: #94a3b8; font-size: 15px; margin: 0 0 24px; }
    .greeting strong { color: #e2e8f0; }
    .otp-label { color: #64748b; font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 12px; }
    .otp-box { background-color: #0a1628; border: 2px solid #1e8fff; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px; }
    .otp-code { color: #1e8fff; font-size: 42px; font-weight: 700; letter-spacing: 12px; font-family: 'Courier New', monospace; display: block; }
    .expiry-notice { background-color: #1a2540; border-left: 3px solid #f59e0b; border-radius: 4px; padding: 12px 16px; margin-bottom: 24px; }
    .expiry-notice p { color: #fbbf24; font-size: 13px; margin: 0; }
    .warning-box { background-color: #1a0a0a; border: 1px solid #7f1d1d; border-radius: 4px; padding: 12px 16px; margin-bottom: 32px; }
    .warning-box p { color: #fca5a5; font-size: 13px; margin: 0; }
    .footer-divider { border: none; border-top: 1px solid #1e3a5f; margin: 0; }
    .footer { padding: 20px 40px; text-align: center; }
    .footer p { color: #475569; font-size: 12px; margin: 0; }
    .footer .classified { color: #1e8fff; font-weight: 700; font-size: 11px; letter-spacing: 2px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <p class="header-title">Rwanda Intelligence Management System</p>
      <h1 class="header-subtitle">Secure Authentication Code</h1>
    </div>
    <div class="body">
      <p class="greeting">Hello, <strong>${name}</strong>.</p>
      <p class="greeting">A login attempt has been initiated for your IMS account. Use the verification code below to complete authentication.</p>

      <p class="otp-label">Your One-Time Password</p>
      <div class="otp-box">
        <span class="otp-code">${otp}</span>
      </div>

      <div class="expiry-notice">
        <p>&#9201; This code expires in <strong>${expiryMinutes} minutes</strong>. Do not delay entering it.</p>
      </div>

      <div class="warning-box">
        <p>&#128274; <strong>Security Notice:</strong> Do not share this code with anyone, including IMS support staff. No legitimate IMS personnel will ever ask for your OTP. If you did not initiate this login, contact your security officer immediately.</p>
      </div>

      <p style="color: #64748b; font-size: 13px; margin: 0;">
        If you did not attempt to log in, please disregard this message and report any suspicious activity to your institution's security officer.
      </p>
    </div>
    <hr class="footer-divider" />
    <div class="footer">
      <p class="classified">CLASSIFIED — OFFICIAL USE ONLY</p>
      <p style="margin-top: 8px;">Rwanda Intelligence Management System &bull; OpCom Division</p>
      <p>This is an automated message. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
`

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: '[IMS] Your Secure Login Code',
    html,
  })
}
