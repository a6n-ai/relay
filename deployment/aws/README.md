# Relay AWS resources

Relay itself is the Cloudflare Worker `relay` (`apps/relay`); it signs its AWS calls with an IAM user's key. These CloudFormation templates hold the AWS side.

| Template | Stack | What it holds |
|---|---|---|
| `ses.yaml` | `relay-ses` (ap-south-1) | identities `relay.a6n.ai` and `a6n.ai`, config sets `relay-prod`, `relay-prod-tracked`, `relay-marketing`, SNS `relay-ses-events` |
| `relay-ses-events.yaml` | `relay-ses-events` (us-east-1) | SNS topic for us-east-1 SES events, delivered to Relay |
| `worker-iam.yaml` | `relay-workers-iam` | IAM user `relay-workers`; key in Secrets Manager `/relay/workers/aws-access-key` |

Worker secrets are set with `apps/relay/scripts/set-secrets.sh`.

## DNS (zone a6n.ai)

| Type | Name | Value |
|---|---|---|
| CNAME | `g2mlzmh5m6u4ypexqmliplh5d76sqgtf._domainkey.relay` | `g2mlzmh5m6u4ypexqmliplh5d76sqgtf.dkim.amazonses.com` |
| CNAME | `trsl7imcgbklmk7s5n6amp6l74drppog._domainkey.relay` | `trsl7imcgbklmk7s5n6amp6l74drppog.dkim.amazonses.com` |
| CNAME | `estxo5vw34x6rzp3c2sfeukz7rhho46d._domainkey.relay` | `estxo5vw34x6rzp3c2sfeukz7rhho46d.dkim.amazonses.com` |
| MX 10 | `mail.relay` | `feedback-smtp.ap-south-1.amazonses.com` |
| TXT | `mail.relay` | `v=spf1 include:amazonses.com ~all` |
| TXT | `_dmarc.relay` | `v=DMARC1; p=none` |
| CNAME | `huvfu7el2o5fopxmgkiipmv3sp27y6ej._domainkey` | `huvfu7el2o5fopxmgkiipmv3sp27y6ej.dkim.amazonses.com` |
| CNAME | `oazkzn4xm62gcfuf4ycsuu4kasdfbb2i._domainkey` | `oazkzn4xm62gcfuf4ycsuu4kasdfbb2i.dkim.amazonses.com` |
| CNAME | `7jpmb2qf5zcb7j6b2ny2uzjwymjupdw4._domainkey` | `7jpmb2qf5zcb7j6b2ny2uzjwymjupdw4.dkim.amazonses.com` |
| MX 10 | `mail` | `feedback-smtp.ap-south-1.amazonses.com` |
| TXT | `mail` | `v=spf1 include:amazonses.com ~all` |

CNAMEs are DNS only (grey cloud). `_dmarc.a6n.ai` already exists (`p=none`). The apex MX stays on Cloudflare Email Routing; it receives Relay mailbox mail.

Check: `aws sesv2 get-email-identity --region ap-south-1 --email-identity relay.a6n.ai --query '[VerificationStatus,DkimAttributes.Status,MailFromAttributes.MailFromDomainStatus]'`.
