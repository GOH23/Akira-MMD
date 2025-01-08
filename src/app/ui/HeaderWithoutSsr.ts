'use client'

import dynamic from 'next/dynamic'

const HeaderLayout = dynamic(() => import("@/app/ui/Header"),{
  ssr: false
})

export default HeaderLayout