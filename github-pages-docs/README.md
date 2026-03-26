# GitHub Pages Documentation Guide

This guide explains how to host your documentation using GitHub Pages, specifically serving content from a `docs` folder located at the root of your repository.

## 1. Preparing the `docs` Folder

First, ensure you have a directory named `docs` at the root of your repository. This folder should contain the static assets (HTML, CSS, JS, images) you want to serve.

### Basic Structure Example:
```
/ (repository root)
├── docs/
│   ├── index.html       <-- Your landing page
│   ├── styles.css
│   └── guide.md
├── github-pages-docs/   <-- This guide
└── ... other files
```

> **Note:** GitHub Pages looks for an `index.html` file in the root of the specified folder as the default entry point.

## 2. Enabling GitHub Pages

Once your `docs` folder is ready and pushed to GitHub, follow these steps:

1.  Navigate to your repository on **GitHub.com**.
2.  Click on the **Settings** tab.
3.  In the left sidebar, under the "Code and automation" section, click on **Pages**.
4.  Under the **Build and deployment** section:
    *   **Source:** Select "Deploy from a branch".
    *   **Branch:** Select the branch you want to deploy from (usually `main` or `master`).
    *   **Folder:** Change the dropdown from `/(root)` to **`/docs`**.
5.  Click **Save**.

## 3. Deployment and Access

After saving, GitHub will start a deployment process using GitHub Actions (by default).

*   You can track the progress in the **Actions** tab of your repository.
*   Once finished, you will see a message on the **Pages** settings page saying "Your site is live at [URL]".
*   The URL usually follows the format: `https://<username>.github.io/<repository-name>/`.

## 4. Why use the `/docs` folder?

Using the `/docs` folder on your main branch has several advantages over using a separate `gh-pages` branch:
- **Unified Source:** Your code and documentation stay in the same branch.
- **Simplicity:** No need to switch branches to update documentation.
- **Automatic Sync:** Every push to the main branch can automatically update your live site.

## 5. Custom Domains (Optional)

If you have a custom domain, you can configure it in the same **Pages** settings page under "Custom domain". Remember to update your DNS settings according to GitHub's documentation.
