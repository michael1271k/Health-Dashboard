'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * The signed-in user's OWN profile. There is no `first_name` column — the only
 * name field is `profiles.display_name` — so the first whitespace token is used
 * as the first name for greetings.
 */
export function useMyProfile() {
  return useQuery({
    queryKey: ['my-profile'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle()
      const displayName = (data as { display_name: string | null } | null)?.display_name ?? null
      const firstName = displayName?.trim().split(/\s+/)[0] || null
      return { displayName, firstName }
    },
  })
}
