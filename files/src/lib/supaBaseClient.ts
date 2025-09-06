import { createClient } from "@supabase/supabase-js";

console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("Supabase anon key starts:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0,10));


const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon);
