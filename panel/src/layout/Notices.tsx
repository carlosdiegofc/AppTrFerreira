// The bell of the top bar: how many things need attention, and the same list as Inicio when it opens.
import { NoticeList } from '../components/NoticeLines';
import { Icon } from '../components/Icon';
import { useNow } from '../data/hooks';
import { useNotices } from '../data/notices';
import { dayInZone } from '../lib/dates';
import { usePopover } from './popover';

export function Notices() {
  const today = dayInZone(useNow(60_000));
  const notices = useNotices(today);
  const { open, setOpen, ref } = usePopover();
  const total = notices.total;
  return (
    <div className="notices-wrap" ref={ref}>
      <button
        type="button"
        className="round"
        aria-label={total === null ? 'Avisos' : total === 0 ? 'Avisos: ninguno' : `Avisos: ${total}`}
        title="Avisos"
        aria-expanded={open}
        aria-controls="avisos"
        onClick={() => setOpen(!open)}
      >
        <Icon name="bell" size={20} />
        {total !== null && total > 0 && (
          <span className="badge" aria-hidden="true">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div className="popover notices" id="avisos">
          <header>
            <h2>Para tener en cuenta</h2>
          </header>
          <NoticeList notices={notices} />
        </div>
      )}
    </div>
  );
}
