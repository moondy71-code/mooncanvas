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
- Drawing engine lives only in src/features/drawing (client-only, lazy); pages use DrawingSurface so the engine can be swapped.
- Recording event model in src/features/recording is engine-agnostic; engines push to a DrawingEventSink.
- Recordings are versioned JSON (src/features/recording/session.ts), stored only in browser localStorage; playback state at time t = initial records + all diffs with t' <= t (seek backwards rebuilds from start).
