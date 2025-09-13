import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// App Router: yksi selain-client kaikille client-komponenteille.
// Tämä käyttää auth-helpersin cookie-sessiota, jolloin middleware ja API-reitit näkevät saman sessionin.
export const supabase = createClientComponentClient();