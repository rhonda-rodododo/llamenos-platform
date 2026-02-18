import { cn } from '@/lib/utils'

export function LogoMark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  }

  return (
    <svg
      viewBox="0 0 32 32"
      className={cn(sizes[size], className)}
      aria-hidden="true"
    >
      <path d="M16 1.5L3.5 6.5v9c0 8.5 5.5 14.5 12.5 16 7-1.5 12.5-7.5 12.5-16v-9L16 1.5z" className="fill-primary dark:fill-primary" />
      <path d="M16 3L5 7.5v8.25c0 7.5 4.75 12.75 11 14.25 6.25-1.5 11-6.75 11-14.25V7.5L16 3z" className="fill-primary/70 dark:fill-primary/50" />
      <g transform="translate(13 15.5) rotate(-40)">
        <rect x="-2.8" y="-6.5" width="5.6" height="2.8" rx="1.3" className="fill-primary-foreground" />
        <rect x="-1.1" y="-4.5" width="2.2" height="9" rx="1" className="fill-primary-foreground" />
        <rect x="-2.4" y="3.5" width="4.8" height="2.8" rx="1.3" className="fill-primary-foreground" />
      </g>
      <path d="M19.5 10.5a4 4 0 0 1 0 5" className="stroke-primary-foreground" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M22 9a6.5 6.5 0 0 1 0 7.5" className="stroke-primary-foreground" strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}
