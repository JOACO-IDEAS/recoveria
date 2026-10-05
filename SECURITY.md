# Security policy

Recoveria contains code for sensitive financial-document workflows. Report suspected vulnerabilities privately to the founder/maintainer; do not open a public issue containing exploit details, credentials, infrastructure identifiers, customer information, or document content.

Never commit `.env*` values, tokens, database URLs, OAuth/service-account material, private keys, Client Zero documents/filenames/artifacts, ground truth, exports, screenshots, backups, production data, or sensitive logs.

If sensitive material is found in Git history, stop. Do not rewrite history or rotate credentials without founder approval. Report only the exposure type, affected file/commit, and required remediation—never the value.

Canonical engineering rules: [knowledge/SECURITY.md](knowledge/SECURITY.md), [knowledge/INVARIANTS.md](knowledge/INVARIANTS.md), and [AGENTS.md](AGENTS.md).
