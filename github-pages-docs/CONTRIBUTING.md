# Contributing to Documentation

When adding or updating documentation in the `docs/` folder, please follow these guidelines:

## Local Testing
Before pushing your changes, always test them locally:
1.  Open `docs/index.html` in your web browser.
2.  Navigate through all updated pages to ensure links are working correctly.
3.  Check for responsive design on different screen sizes.

## Relative Links
Use relative links for all internal documentation paths:
- **Correct:** `[Link Text](other-page.html)` or `[Image Alt Text](assets/image.png)`
- **Incorrect:** `[Link Text](/docs/other-page.html)` or `[Link Text](https://github.com/user/repo/blob/main/docs/other-page.html)`

Relative links ensure that the documentation works both locally and when served via GitHub Pages.

## Style Guidelines
- Use clear and concise Markdown for documentation pages.
- Ensure all images have descriptive `alt` text.
- Follow the existing project terminology and tone.
