import { Context, Next } from 'hono';
import { graphql as ponderGraphql } from 'ponder';
import { db } from 'ponder:api';
import schema from 'ponder:schema';

export async function graphqlRouteHandler(c: Context, next: Next) {
  return ponderGraphql({ db, schema })(c, next);
}
