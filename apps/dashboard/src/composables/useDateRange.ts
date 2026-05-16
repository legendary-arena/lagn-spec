import { ref, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { DateRange } from '../types/index.js';

const VALID_RANGES: DateRange[] = ['7d', '14d', '30d', '90d'];
const DEFAULT_RANGE: DateRange = '7d';

function isValidRange(value: unknown): value is DateRange {
  return typeof value === 'string' && VALID_RANGES.includes(value as DateRange);
}

interface UseDateRangeReturn {
  range: Ref<DateRange>;
  setRange: (newRange: DateRange) => void;
  validRanges: readonly DateRange[];
}

export function useDateRange(): UseDateRangeReturn {
  const route = useRoute();
  const router = useRouter();

  const queryRange = route.query.range;
  const initialRange: DateRange = isValidRange(queryRange) ? queryRange : DEFAULT_RANGE;

  const range = ref<DateRange>(initialRange);

  function setRange(newRange: DateRange): void {
    range.value = newRange;
    router.replace({ query: { ...route.query, range: newRange } });
  }

  watch(
    () => route.query.range,
    (newQueryRange) => {
      if (isValidRange(newQueryRange)) {
        range.value = newQueryRange;
      } else {
        range.value = DEFAULT_RANGE;
      }
    },
  );

  return { range, setRange, validRanges: VALID_RANGES };
}
