# Push to GitHub (One-Time Setup)

## 1. Create a Personal Access Token

1. Go to: **https://github.com/settings/tokens/new**
2. **Note:** `expense-tracker` (or any name)
3. **Expiration:** 90 days or No expiration
4. **Scopes:** Check **repo** (full control)
5. Click **Generate token**
6. **Copy the token** (starts with `ghp_...`) — you won't see it again!

---

## 2. Push Using the Token

Open **Terminal** and run:

```bash
cd /Users/rahulnadendla/cursor_project_2

# Push (replace YOUR_TOKEN with your actual token)
git push https://rahulnadendla:YOUR_TOKEN@github.com/rahulnadendla/expense-tracker.git main
```

**Example:** If your token is `ghp_abc123xyz`, the command would be:
```bash
git push https://rahulnadendla:ghp_abc123xyz@github.com/rahulnadendla/expense-tracker.git main
```

---

## 3. Set Upstream (So Future Pushes Are Simpler)

After the first push succeeds, run:

```bash
git branch -u origin main
```

Then next time you can just run:
```bash
git push
```
(You may be prompted for username/password — use your token as the password, or set up credential storage.)

---

## 4. Optional: Store Credentials (No More Typing Token)

To avoid entering the token every time:

```bash
git config --global credential.helper store
```

Then do one more push with the token in the URL (as in step 2). Git will save it. After that, `git push` will work without prompting.

**Security note:** The token is stored in plain text in `~/.git-credentials`. Only do this on your personal machine.

---

## Troubleshooting

- **"Authentication failed"** — Double-check the token, ensure no extra spaces when pasting.
- **"Repository not found"** — Confirm the repo is `rahulnadendla/expense-tracker` and you're logged into the right GitHub account.
- **Token doesn't work** — Create a new token and ensure the **repo** scope is checked.
