"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="fatal-error">
      <div className="fatal-error__icon" aria-hidden="true">!</div>
      <h1>画面を読み込めませんでした</h1>
      <p>ファイルは送信されていません。ページを再読み込みして、もう一度お試しください。</p>
      <button className="button button--primary" type="button" onClick={reset}>
        再読み込み
      </button>
    </main>
  );
}
