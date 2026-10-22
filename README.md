# NCAA Women's Volleyball Conferences 2026

A static site listing every NCAA Division I, II, and III women's volleyball
conference, with an interactive map of each conference's schools.

Open `index.html`. Each conference card links to its map (`maps/`), its Massey
Ratings standings, and each school's Niche profile and volleyball roster (a
search when no verified direct link exists). The index has a search box for
finding a school or conference.

Each map shows every school at its campus location, numbered by its order
within the conference by Massey national rank. A school's popup has its
Massey rank, city and locale type, and 2024-25 tuition + fees. Use the layer
button to switch between a street map and a terrain map.

## Data sources

- **Massey Ratings** (masseyratings.com): conferences, team lists, and
  national ranks. Snapshot taken 2026-10-22.
- **IPEDS** (U.S. Dept. of Education, nces.ed.gov/ipeds): campus coordinates,
  city, locale type, and 2024-25 tuition + fees. Public-domain federal data.
- **Map tiles:** Esri World Street Map and World Topo, via Leaflet 1.9.4.

Ranks are a point-in-time snapshot and change weekly during the season.

## Hosting

Plain static files with no build step: works from GitHub Pages or straight
from disk.
