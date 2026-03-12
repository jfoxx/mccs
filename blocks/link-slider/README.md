# Link Slider Block

## Overview

The Link Slider block displays a horizontal row of linked images that scroll when the content exceeds the viewport width. It includes a custom progress bar (red fill, gray track) showing how much content has been viewed, plus previous/next navigation buttons.

## Usage

Structure your content in a table with two columns per row:

| Link Slider | |
|-------------|---|
| [image] | [link URL] |
| [image] | [link URL] |

- **Column 1**: The image (picture or img)
- **Column 2**: The destination URL — either a hyperlink or plain text path

Each row becomes a clickable card linking to the specified URL. Images are optimized at 300px width.

## Features

- Horizontal scrolling with hidden native scrollbar
- Custom progress bar: red portion = content viewed, gray = remaining
- Previous/Next buttons for manual navigation
- Scroll snap for smooth alignment
- Responsive layout
