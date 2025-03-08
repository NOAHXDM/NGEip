import { Pipe, PipeTransform } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { format } from 'date-fns';
@Pipe({
  name: 'firestoreTimestamp',
  standalone: true,
})
export class FirestoreTimestampPipe implements PipeTransform {
  transform(value: Timestamp, object?: { key: string }): string {
    if (!value) {
      return '-';
    }
    if (object && object.key) {
      return format(value.toDate(), object.key);
    }

    return format(value.toDate(), 'yyyy-MM-dd EEE HH:mm:ss');
  }
}
