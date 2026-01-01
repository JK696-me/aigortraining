import { createContext, useContext, useState, ReactNode } from 'react'

interface IntroContextType {
  isIntroOpen: boolean
  setIntroOpen: (open: boolean) => void
}

const IntroContext = createContext<IntroContextType | undefined>(undefined)

export function IntroProvider({ children }: { children: ReactNode }) {
  const [isIntroOpen, setIntroOpen] = useState(false)

  return (
    <IntroContext.Provider value={{ isIntroOpen, setIntroOpen }}>
      {children}
    </IntroContext.Provider>
  )
}

export function useIntro() {
  const context = useContext(IntroContext)
  if (!context) {
    throw new Error('useIntro must be used within IntroProvider')
  }
  return context
}
