declare module "next/navigation" {
  export function useRouter(): any;
  export function usePathname(): string;
  export function useSearchParams(): any;
  export function useParams(): any;
  export function redirect(url: string): void;
  export function notFound(): void;
}
