# Supabase email templates (Authentication → Emails)

Sign-in uses Supabase's token-hash link plus a typed code, so it works in any
browser, Chrome profile or device. Paste these into the Marketing machine project.

## Magic Link
Subject: `Your Brand Studio sign-in`

```html
<h2>Sign in to Brand Studio</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
<p>Or type this code on the sign-in page: <strong>{{ .Token }}</strong></p>
<p>The link and code work once and expire in an hour.</p>
```

## Confirm signup (first sign-in for a new person)
Subject: `Your Brand Studio sign-in`

```html
<h2>Sign in to Brand Studio</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
<p>Or type this code on the sign-in page: <strong>{{ .Token }}</strong></p>
```

`{{ .SiteURL }}` is the Site URL under Authentication → URL Configuration
(https://altallmarketing.netlify.app).
