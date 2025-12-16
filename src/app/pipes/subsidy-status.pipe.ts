import { Pipe, PipeTransform } from '@angular/core';
import { SubsidyStatus } from '../services/subsidy.service';

@Pipe({
  name: 'subsidyStatus',
  standalone: true,
})
export class SubsidyStatusPipe implements PipeTransform {
  private statusMap: Record<SubsidyStatus, string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
  };

  transform(value: SubsidyStatus): string {
    return this.statusMap[value] || '-';
  }
}
