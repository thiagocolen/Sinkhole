# Frequently Asked Questions (FAQ)

## 1. Why am I getting a 404 error when visiting my GitHub Pages site?
Check the following:
- Ensure the `index.html` file is in the root of your `docs` folder.
- Verify that the correct branch and folder (`/docs`) are selected in your repository's **Pages** settings.
- Wait a few minutes after pushing your changes for the deployment to finish.

## 2. Can I use a custom domain with the `/docs` folder source?
Yes. You can configure a custom domain in your repository's **Pages** settings. GitHub will automatically create a `CNAME` file in the root of your default branch (usually outside the `docs/` folder, but sometimes inside it depending on your setup). It's best to configure it through the UI.

## 3. My CSS or images aren't loading correctly.
Ensure all your links are relative. If your CSS is in `docs/css/styles.css` and your HTML is in `docs/index.html`, use `<link rel="stylesheet" href="css/styles.css">`. Do not use absolute paths starting with `/`.

## 4. Does GitHub Pages support Jekyll with the `/docs` folder?
Yes. GitHub Pages will process your `docs` folder with Jekyll by default unless you add a `.nojekyll` file to the root of your `docs` folder. If you're using plain HTML/CSS and don't need Jekyll, adding a `.nojekyll` file can speed up deployment.
