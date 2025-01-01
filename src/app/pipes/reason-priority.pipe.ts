import { Pipe, PipeTransform } from '@angular/core';
import { AttendanceService } from '../services/attendance.service';

@Pipe({
  name: 'reasonPriority',
  standalone: true,
})
export class ReasonPriorityPipe implements PipeTransform {
  constructor(private attendanceService: AttendanceService) {}

  transform(value: number): string {
    return (
      this.attendanceService.reasonPriorityList.find(
        (reasonPriority) => reasonPriority.value === value
      )?.text || '-'
    );
  }
}
