start:
    npm install
    npx supabase start
    npx supabase migration up
    npm run dev

stop:
    npx supabase stop

test:
    npm test

test-e2e:
    npm run test:e2e

typecheck:
    npm run typecheck
