# Footer Block

## Overview

The Footer block loads its content from a fragment and renders a two-part footer: a dark blue main area with multiple link columns, and a red subfooter strip with the Marines logo and legal links.

## Content Source

The footer is loaded from a fragment. The default path is `/navigation/footer` unless overridden by the `footer` metadata property.

## Structure

The fragment content is split into sections (by section breaks in the source document):

- **Main footer (dark blue):** All sections except the last become columns in a responsive grid. Each column typically has a heading and a list of links.
- **Subfooter (red strip):** The last section becomes the subfooter. It should contain the Marines logo (picture/img) and the legal links (No FEAR Act, FOIA, Accessibility, Privacy Policy, © notice).

## Layout

- **Main footer:** Full-width dark blue background, centered content (max-width 1200px), responsive grid of columns. The first column (e.g., "Marine Corps Community Services" with intro text) is wider on larger screens.
- **Subfooter:** Full-width red background, logo on the left, legal links on the right with pipe separators.

## Features

- Edge-to-edge backgrounds (dark blue and red)
- Marines logo from fragment content, linked to marines.mil
- Multistore support: store switcher button when `isMultistore()` is true
- Link styling matches paragraph text (1.4rem)
