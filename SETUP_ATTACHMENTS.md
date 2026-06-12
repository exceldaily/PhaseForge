# File Attachments Setup Guide

## Prerequisites
File attachments require setting up a Supabase Storage bucket and creating the database table.

## Step 1: Create the Supabase Storage Bucket

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project (phaseforge)
3. Go to **Storage** in the left sidebar
4. Click **Create a new bucket**
5. Name it: `project-attachments`
6. **Uncheck** "Make it private" (Public is fine, or you can keep it private and configure auth)
7. Click **Create bucket**

## Step 2: Create the Database Table

Run the migration:

```bash
# Option A: Using Supabase CLI
supabase migration up

# Option B: Manual SQL in Supabase Dashboard
# 1. Go to SQL Editor
# 2. Create a new query
# 3. Copy & paste the contents of supabase/migrations/add_project_attachments.sql
# 4. Run the query
```

## Step 3: Test

1. Go to any project in Phase Forge
2. Click the **Files** tab
3. You should see the upload area
4. Try uploading a file

## Bucket Configuration

If you want to keep uploads private (recommended):

1. In Supabase Storage, select the `project-attachments` bucket
2. Click **Policies** tab
3. Skip this - RLS policies in the database handle access control

## Troubleshooting

**"Bucket not found" error:**
- Make sure the bucket is named exactly `project-attachments`
- Check that the bucket exists in the Storage section

**"Permission denied" when uploading:**
- Make sure your user role is `owner`, `admin`, or `manager`
- Check that you own the project

**Files not showing up:**
- Run the migration to create the `project_attachments` table
- Check that the table exists in Supabase Database

## Environment Variables

No additional environment variables needed - uses existing `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
