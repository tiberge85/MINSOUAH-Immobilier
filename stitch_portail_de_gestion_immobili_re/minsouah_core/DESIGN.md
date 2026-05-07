---
name: Minsouah Core
colors:
  surface: '#fff8f2'
  surface-dim: '#e3d9ca'
  surface-bright: '#fff8f2'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fdf2e3'
  surface-container: '#f7edde'
  surface-container-high: '#f1e7d8'
  surface-container-highest: '#ebe1d2'
  on-surface: '#1f1b12'
  on-surface-variant: '#4f4634'
  inverse-surface: '#353026'
  inverse-on-surface: '#faefe0'
  outline: '#817662'
  outline-variant: '#d2c5ae'
  surface-tint: '#785a00'
  primary: '#785a00'
  on-primary: '#ffffff'
  primary-container: '#e5b228'
  on-primary-container: '#5e4600'
  inverse-primary: '#f4bf36'
  secondary: '#645d5a'
  on-secondary: '#ffffff'
  secondary-container: '#ebe0dd'
  on-secondary-container: '#6a6360'
  tertiary: '#006399'
  on-tertiary: '#ffffff'
  tertiary-container: '#75c0ff'
  on-tertiary-container: '#004e79'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdf9b'
  primary-fixed-dim: '#f4bf36'
  on-primary-fixed: '#251a00'
  on-primary-fixed-variant: '#5a4300'
  secondary-fixed: '#ebe0dd'
  secondary-fixed-dim: '#cec4c1'
  on-secondary-fixed: '#1f1a19'
  on-secondary-fixed-variant: '#4c4543'
  tertiary-fixed: '#cde5ff'
  tertiary-fixed-dim: '#94ccff'
  on-tertiary-fixed: '#001d32'
  on-tertiary-fixed-variant: '#004b74'
  background: '#fff8f2'
  on-background: '#1f1b12'
  surface-variant: '#ebe1d2'
typography:
  display:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
  h1:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  h2:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  h3:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin: 32px
---

## Brand & Style

The brand personality for this design system is **Sophisticated, Reliable, and Forward-Thinking**. It targets real estate professionals and property owners who value efficiency without sacrificing elegance. The UI should evoke a sense of "premium stability"—users must feel their high-value assets are managed by a secure, modern platform.

The design style is **Corporate / Modern** with a focus on high-end editorial clarity. It utilizes a refined balance of generous white space and structured data presentation. The aesthetic avoids the coldness of typical fintech by using warm ochre tones and soft organic corners, bridging the gap between digital utility and the physical warmth of real estate.

## Colors

The palette is derived directly from the brand’s visual identity to ensure immediate recognition.

- **Primary (Gold/Ochre):** Used for key actions, brand moments, and highlighting active states. It represents the value and premium nature of the real estate market.
- **Secondary (Charcoal/Brown):** Used for primary typography, navigation bars, and structural elements. It provides a grounded, architectural foundation.
- **Accent (Teal):** A strategic complementary color used for success states, secondary interactions, and data visualizations to provide contrast against the warm primary tones.
- **Backgrounds:** A tiered system of pure white for cards and surfaces, and a very light cool gray for page backgrounds to provide depth and reduce eye strain during long sessions.

## Typography

This design system employs a dual-font strategy to balance character with utility.

- **Manrope** is used for headlines. Its geometric yet friendly terminals provide a modern, "reinvented" feel that aligns with the brand slogan.
- **Inter** is the workhorse for all body text, tables, and dashboards. It is chosen for its exceptional legibility in data-heavy environments, specifically its tall x-height and clear numeric distinctions.

Maintain a strict vertical rhythm by adhering to the defined line heights. Use the "Label" styles for metadata and form headers to ensure a clear hierarchy against body text.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for desktop dashboards and a flexible single-column layout for mobile. 

- **The 8px Grid:** All spacing between elements must be a multiple of the 4px/8px base unit.
- **Density:** Dashboards should prioritize information density (using `sm` and `md` spacing) while marketing and landing pages should use `lg` and `xl` spacing to create an "airy" and premium feel.
- **Alignment:** Content should be left-aligned to mirror architectural blueprints, with data tables utilizing right-alignment for numeric values to ensure rapid scannability.

## Elevation & Depth

Hierarchy is established through **Ambient Shadows** and **Tonal Layering** rather than heavy borders.

- **Level 0 (Background):** The base layer using the light gray background color.
- **Level 1 (Cards/Content):** Pure white surfaces with a very subtle, diffused shadow (0px 4px 20px rgba(62, 56, 54, 0.05)).
- **Level 2 (Dropdowns/Modals):** Elevated surfaces with a more pronounced shadow (0px 10px 30px rgba(62, 56, 54, 0.12)) to provide clear visual separation from the content below.

Avoid using pure black shadows; always tint shadows with the secondary charcoal color to maintain a professional, integrated look.

## Shapes

The shape language is consistently **Rounded**. This softens the "rigid" nature of real estate management and makes the software feel more approachable.

- **Standard Radius:** 0.5rem (8px) for buttons, input fields, and small UI components.
- **Large Radius:** 1rem (16px) for main content containers and cards.
- **Interactive Elements:** Buttons should always maintain the standard radius; avoid pill-shapes to keep the aesthetic professional and structured.

## Components

- **Buttons:** Primary buttons use the Ochre background with white or dark charcoal text. Secondary buttons should use a ghost style with a subtle charcoal border.
- **Inputs:** High-contrast fields with a 1px border in light gray. On focus, the border transitions to the primary Ochre color with a soft outer glow.
- **Data Tables:** Clean, borderless rows with subtle dividers. Use zebra-striping only for very large datasets. Header rows should be slightly darker charcoal with uppercase white or light gray labels.
- **Status Chips:** Small, rounded badges for "Leased," "Available," or "Maintenance." Use low-opacity versions of the status colors (Success/Error/Accent) with high-saturation text.
- **Cards:** The primary container for property listings. Should feature a high-quality image, followed by a titled section using Manrope and a price tag highlighted in the primary Ochre.
- **Navigation:** A side navigation bar using the deep charcoal background, with active states indicated by a primary Ochre vertical bar on the left edge.