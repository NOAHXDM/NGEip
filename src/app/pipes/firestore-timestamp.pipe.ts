import { inject, Pipe, PipeTransform } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { format } from 'date-fns';

import { TimezoneService } from '../services/timezone.service';

@Pipe({
  name: 'firestoreTimestamp',
  standalone: true,
})
export class FirestoreTimestampPipe implements PipeTransform {
  timezoneService = inject(TimezoneService);

  transform(value: Timestamp, formatStr: string='yyyy-MM-dd EEE HH:mm:ss'): string {
    if (!value) {
      return '-';
    }    
    
    return format(this.timezoneService.convertDateByClientTimezone(value), formatStr);
  }
}
