# First deployment: from no server to client acceptance

The application is packaged, but it is not online yet. You need a hosting account, a domain, and a valid OpenAI API credential. Create these under your client's ownership where possible, so billing and recovery do not depend on the developer's personal account.

## 1. Obtain the server and domain

A practical small-workspace choice is a DigitalOcean Basic Droplet with regular CPU, **2 vCPUs / 4 GiB RAM**, Ubuntu **24.04 LTS**, and a region near the client. The listed server price checked on 22 November 2026 is **USD 24/month**, excluding domain registration, backups, taxes, and API usage. Confirm the final price before purchase. [Official pricing](https://www.digitalocean.com/pricing/droplets) · [Create a Droplet](https://docs.digitalocean.com/products/droplets/how-to/create/).

Purchase/choose the app's domain in your or your client's registrar account. Create an **A record** for the desired subdomain, such as `lessons`, pointing to the server's public IPv4 address. Do not add an AAAA record unless the server's IPv6 address is also configured. Initially use DNS-only routing if the DNS provider offers a proxy option.

Use SSH-key login. Keep the private key on your computer; add only the public key to the host provider. Configure the provider firewall to allow TCP 80 and 443 publicly and SSH only from your administrator IP. Do not expose PostgreSQL port 5432 or application port 8080. Keep outbound DNS/HTTPS available for certificate issuance and the AI provider.

These are account creation and paid infrastructure actions that you or your client must perform. This package does not purchase hosting or a domain.

## 2. Install Docker and upload the package

Follow the [official Docker Engine installation for Ubuntu](https://docs.docker.com/engine/install/ubuntu/) including the Compose plugin. Then check:

```sh
sudo docker version
sudo docker compose version
```

Upload `lessonly-client-package.zip` using your SSH/SFTP client. Extract it to a new deployment directory and enter its `lessonly` directory. All following commands run from that directory. Keep SSH host-key verification enabled; verify a new server's fingerprint through the hosting provider before accepting it.

## 3. Configure the new API key privately

In the OpenAI platform, use the client's API project with billing and access to the configured model. For an application identity, use a project service account where available. Create a replacement key and revoke the credential previously pasted into chat. [Official guidance on API keys and service accounts](https://developers.openai.com/api/docs/guides/api-keys).

On the server, in your own interactive terminal:

```sh
python3 tools/configure.py
```

The helper prompts for the domain and key. The key input is hidden, is not passed as a shell argument, and is not printed. It generates a strong database password and invitation code, and creates `.env` with mode 0600. It refuses to overwrite an existing configuration. Key validity is tested in the next stage, not inferred from its prefix or length.

The file must remain on the server and out of repositories, archives and chat. The provided build/release exclusions cover it. Docker administrators can still inspect container environment variables, so restrict host/Docker access to trusted operators. OpenAI recommends loading credentials on the server from environment variables or a key manager: [API authentication](https://developers.openai.com/api/reference/overview).

If rotating an already configured key:

```sh
python3 tools/configure.py --rotate-api-key
sudo docker compose up -d --force-recreate web worker
```

Rotation preserves the existing database password and other settings.

## 4. Launch and verify HTTPS

```sh
sudo docker compose config --quiet
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=60 migrate web worker proxy
```

Use `config --quiet`; plain `docker compose config` prints resolved secrets. Caddy requests a certificate for the configured domain after DNS and ports are ready. Check the real URL in a browser without bypassing certificate warnings.

```sh
curl --fail --show-error https://YOUR_APP_DOMAIN/api/health
```

Expected response: `{"status":"ok"}`. A successful health response confirms database reachability, not AI access.

## 5. Verify AI access and the complete deployment

Run a small billable AI request first:

```sh
sudo docker compose exec worker python tools/live_ai_smoke.py
```

If it reports HTTP 401, the key is invalid/revoked or belongs to the wrong provider. If it reports access/model errors, confirm project permissions and the `OPENAI_MODEL` setting. For rate/billing errors, check the API project's limits and billing. Do not paste the key or `.env` into chat for troubleshooting.

Open the HTTPS app and create an educator account using `REGISTRATION_CODE` from your private server configuration. Keep its password private.

Then run the full acceptance script (nine billable artifact-generation requests):

```sh
sudo docker compose exec -it web python tools/verify_deployment.py \
  --url https://YOUR_APP_DOMAIN \
  --email YOUR_EDUCATOR_EMAIL \
  --all-artifacts \
  --report /tmp/deployment-verification.json

sudo docker compose cp web:/tmp/deployment-verification.json ./deployment-verification.json
```

It asks privately for the educator password, verifies a trusted matching TLS certificate and HTTP-to-HTTPS redirect, tests protected login, uploads a synthetic text-bearing PDF, generates all nine artifacts through the worker, verifies edits/review status after a new login, and downloads the four supported export formats. It removes only the test project it created. If generation is still running when a test times out, the report identifies the remaining test project for later cleanup. No credentials are written into the report.

Finally, use the browser to review the output quality and print-to-PDF layout. Perform the backup/restore rehearsal in `OPERATIONS.md`. These human review and operational checks are additional to the automated acceptance script.

## 6. Client signoff

Provide the client with the HTTPS URL, the source package, their operator access through an approved secure channel, `TEST_REPORT.md`, and the **actual** `deployment-verification.json` from the target host. Only report live tests as passed when the generated report says `"passed": true` and browser/backup checks are complete.

For continued assistance, share only the server's public IP, domain, non-secret connection information, and the redacted test results. Never share private keys, passwords, API keys, cookies or the full `.env` file.
