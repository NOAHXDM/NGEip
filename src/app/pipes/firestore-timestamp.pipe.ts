import { Pipe, PipeTransform } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { format } from 'date-fns';

@Pipe({
  name: 'firestoreTimestamp',
  standalone: true,
})
export class FirestoreTimestampPipe implements PipeTransform {
  transform(value: Timestamp, formatStr: string='yyyy-MM-dd EEE HH:mm:ss'): string {
    if (!value) {
      return '-';
    }
    return format(value.toDate(), formatStr);
  }
}
