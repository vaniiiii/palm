import { Hono } from 'hono';
import { graphqlRouteHandler } from './graphql';

const app = new Hono();

app.use('/graphql', graphqlRouteHandler);

export default app;
