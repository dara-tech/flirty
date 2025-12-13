# Fix Google OAuth "Block Access" Error

## Problem
When trying to sign in with Google, you see "Access blocked" or "Block access" error.

## Common Causes

1. **OAuth Consent Screen Not Configured**
2. **App in Testing Mode** - Your email not added to test users
3. **Redirect URI Not Whitelisted** - Missing redirect URI in Google Cloud Console
4. **App Not Published** - App needs to be published or in testing mode with your email

## Solution Steps

### Step 1: Check Your Redirect URI

The app uses this redirect URI format:
- **Development**: `exp://192.168.0.116:8081` or `mobile://`
- **Production**: `mobile://` or `com.anonymous.mobile://`

Check the console logs when you try to sign in - it will show the exact redirect URI being used.

### Step 2: Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Go to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID: `283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com`
5. Click **Edit** (pencil icon)

### Step 3: Add Authorized Redirect URIs

In the OAuth client configuration, add these redirect URIs:

**For Development:**
```
exp://192.168.0.116:8081
exp://localhost:8081
mobile://
```

**For Production:**
```
mobile://
com.anonymous.mobile://
```

**For Android:**
```
com.anonymous.mobile:/oauthredirect
```

### Step 4: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (unless you have Google Workspace)
3. Fill in required fields:
   - **App name**: Chatu
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Click **Save and Continue**

### Step 5: Add Test Users (If App is in Testing)

1. In **OAuth consent screen**, scroll to **Test users**
2. Click **Add Users**
3. Add your email address (the one you're trying to sign in with)
4. Click **Save**

### Step 6: Publish App (Optional)

If you want anyone to use Google sign-in:
1. In **OAuth consent screen**, click **Publish App**
2. This makes it available to all users (no test user list needed)

**Note**: Publishing requires app verification if you request sensitive scopes.

## Verify Configuration

After making changes:

1. **Wait 5-10 minutes** for changes to propagate
2. **Clear app cache** or restart the app
3. Try Google sign-in again
4. Check console logs for the redirect URI being used

## Debugging

The app now logs detailed error messages. Check the console for:
- Redirect URI being used
- Error codes and descriptions
- Specific error messages

## Common Error Messages

| Error | Solution |
|-------|----------|
| `access_denied` | Add your email to test users or publish the app |
| `redirect_uri_mismatch` | Add the redirect URI shown in logs to Google Cloud Console |
| `invalid_client` | Check Client ID is correct |
| `unauthorized_client` | Check OAuth consent screen is configured |

## Still Not Working?

1. Check the exact redirect URI in console logs
2. Verify it's added to Google Cloud Console
3. Make sure OAuth consent screen is saved
4. Wait 5-10 minutes after making changes
5. Try signing in again

## Need Help?

Check the console logs - they now show:
- The redirect URI being used
- Detailed error messages
- What to check/fix
