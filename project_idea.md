I play DND with friends and would like to build a website for generating DND cards. Initially, we'll focus on item cards. Several sites exist to do this sort of thing, but they tend to produce cards that are hard for me to read. I am visually impaired, want cards that are very legible (not overly stylized) and have fairly large fonts. This probably requires us to do 2 or 4 cards per 8.5 x 11 page. That's fine. I'm used to big things.

Some constraints/goals/thoughts:
1. not overly stylized
2. a dropdown choice to produce 2 or 4 cards per page.
3. Overall font should be large (with usual conventions like title larger, body smaller, metadata probably in between). However, if all fonts are specified in rem, then 1rem should still be pretty big.
4. Ideally, there'd be a scaling property like:
   1. short title, body = normal font
   2. if title very long, body very long, font scales down to accomodate
   3. Obviously there will be hard practical limits on card body length.
5. I know that printing front/back can
6. I'd like to share this with others eventually, so it should be a website
7. Maybe it will have auth eventually, but not yet. I'm inclined to start frontend-only, with export to json as the only data storage mechanism
8. I'm flexible on the frontennd tech stack. I lean toward a SPA or statically build nextjs site for simplicity of deployment
9. Ideally, cards could be created as:
   1. Start completely custom OR pull from a known dnd item API set
      - Does a free API exist? Are there options? https://www.dnd5eapi.co/ seems like a possibility
   2. customize further from there
10. This is for DND 5e
11. Regarding fronts and backs of cards: I'm happy to start as front-only
12. It would be nice to have simple images on the card, but these cards are large, so there's no point in having the image take up 50% of the card. A small image in top right corner would be cool.
    - Image source is a question... if needed, we can just do a placeholder for now, later expanding to a few specific types (e.g., one image each for weabpon/armor/potion/scroll etc)
