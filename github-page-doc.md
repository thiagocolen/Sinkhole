# Sinkhole | GitHub Pages Documentation Guide

This project uses the `docs/` folder to host its official documentation via GitHub Pages.

## How it works

The `docs/` folder contains the static HTML/CSS/JS files that make up the Sinkhole documentation site. When the repository is configured correctly on GitHub, the content of this folder is served as a website.

## Setup Instructions

To enable the documentation site:

1.  Go to your repository settings on GitHub.
2.  Navigate to the **Pages** section in the left sidebar.
3.  Under **Build and deployment**, set the **Source** to "Deploy from a branch".
4.  Under **Branch**, select `master` (or your main branch) and the `/docs` folder.
5.  Click **Save**.

Your documentation will be live at `https://<your-username>.github.io/Sinkhole/`.

## Folder Structure

- `docs/index.html`: The main landing page.
- `docs/assets/`: Images and other static assets used in the documentation.
- `docs/styles.css`: (Optional) Global styles for the documentation.

## Contributing to Documentation

When updating the documentation, ensure that you test your changes locally by opening `docs/index.html` in your browser. All links within the documentation should be relative to the `docs/` folder.
