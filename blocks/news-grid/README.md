# News Grid Block

Displays a full grid of news articles fetched from `/news/query-index.json`, with background images, type badges, and a "Read More Stories" CTA. Used on the homepage.

## Usage

Add a News Grid block to a page. Optionally configure with rows:

| News Grid   |                                             |
|-------------|---------------------------------------------|
| Heading     | Stay Informed                               |
| Subheading  | View local events, stories, updates, and more. |
| News Link   | /news                                       |
| Events Link | /events                                     |

If no rows are provided, defaults are used.

## Features

- Fetches all articles from `/news/query-index.json`
- Displays in a 4-column responsive grid (1 col mobile, 2 col tablet, 4 col desktop)
- Each card: background image, type badge (NEWS / INFOGRAPHIC), title
- Footer: "View More Events" (optional) and "Read More Stories" buttons
- Full-width dark navy background matching MCCS brand
