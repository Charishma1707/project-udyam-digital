<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Imported design screens live as generated HTML+script modules in `src/screens/*` and render through `DesignScreen` (markup, inline behavior, label-based navigation); each screen keeps its own palette via a `.t<hash>` theme class in `src/styles.css`. Why: preserves the exported designs exactly while giving each one a real route.
- The external FastAPI backend is reached only through server functions in `src/lib/udyam-backend.functions.ts` (URL from `UDYAM_BACKEND_URL`, defaulting to the tunnel in backend.md). Why: avoids browser CORS/tunnel interstitials and keeps the URL swappable.
