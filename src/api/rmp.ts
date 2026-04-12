// Rate My Professor unofficial GraphQL API integration.
// School ID can be overridden via RMP_SCHOOL_ID env var.
// To find your school's ID: search https://www.ratemyprofessors.com and inspect
// the network request to /graphql — look for the schoolID in the teacher search query.

const RMP_GQL     = 'https://www.ratemyprofessors.com/graphql';
const RMP_AUTH    = 'Basic dGVzdDp0ZXN0';
const SCHOOL_ID   = process.env.RMP_SCHOOL_ID || 'U2Nob29sLTE0NTI='; // University of Ottawa

export interface RmpResult {
  rating:     number | null;
  numRatings: number | null;
  url:        string | null;
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Simple in-memory cache — keyed by lowercase instructor name
const cache = new Map<string, RmpResult>();

const QUERY = `
  query TeacherSearch($text: String!, $schoolID: ID) {
    newSearch {
      teachers(query: { text: $text, schoolID: $schoolID, fallback: true }) {
        edges {
          node {
            legacyId
            firstName
            lastName
            avgRating
            numRatings
            school { name }
          }
        }
      }
    }
  }
`;

export async function getRmpRating(instructorName: string): Promise<RmpResult> {
  const key = instructorName.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key)!;

  const empty: RmpResult = { rating: null, numRatings: null, url: null };

  try {
    const res = await fetch(RMP_GQL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': RMP_AUTH,
      },
      body: JSON.stringify({ query: QUERY, variables: { text: stripAccents(instructorName), schoolID: SCHOOL_ID } }),
    });

    if (!res.ok) { cache.set(key, empty); return empty; }

    const json = await res.json() as {
      data?: {
        newSearch?: {
          teachers?: {
            edges: { node: { legacyId: number; firstName: string; lastName: string; avgRating: number; numRatings: number; school: { name: string } } }[]
          }
        }
      }
    };

    const edges = json?.data?.newSearch?.teachers?.edges ?? [];
    if (edges.length === 0) { cache.set(key, empty); return empty; }

    // Only consider professors at uOttawa
    const ottawaEdges = edges.filter(e =>
      e.node.school.name.toLowerCase().includes('ottawa')
    );
    if (ottawaEdges.length === 0) { cache.set(key, empty); return empty; }

    // Pick the best match: prefer exact full-name match, otherwise take first uOttawa result
    const nameLower = key;
    const best = ottawaEdges.find(e => {
      const full = `${e.node.firstName} ${e.node.lastName}`.toLowerCase();
      return full === nameLower;
    }) ?? ottawaEdges[0];

    const result: RmpResult = {
      rating:     best.node.avgRating   > 0 ? best.node.avgRating   : null,
      numRatings: best.node.numRatings  > 0 ? best.node.numRatings  : null,
      url:        `https://www.ratemyprofessors.com/professor/${best.node.legacyId}`,
    };

    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, empty);
    return empty;
  }
}
