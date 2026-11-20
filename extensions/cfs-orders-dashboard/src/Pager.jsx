import { pageItems } from './orderList';

// Page buttons: a window of five numbers, then Next and All. Used by both order lists.
export default function Pager({ page, pageCount, all, onPage, onAll }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-text>Page:</s-text>
      {pageItems(all ? 0 : page, pageCount).map((item) => {
        if (item === 'next') return all ? null : <s-button key="next" onClick={() => onPage(page + 1)}>Next</s-button>;
        if (item === 'all') return <s-button key="all" variant={all ? 'primary' : 'secondary'} onClick={onAll}>All</s-button>;
        return <s-button key={item} variant={!all && item === page ? 'primary' : 'secondary'} onClick={() => onPage(item)}>{String(item)}</s-button>;
      })}
    </s-stack>
  );
}
