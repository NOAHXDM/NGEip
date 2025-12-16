import { Pipe, PipeTransform } from '@angular/core';
import { SubsidyService } from '../services/subsidy.service';

@Pipe({
  name: 'subsidyType',
  standalone: true,
})
export class SubsidyTypePipe implements PipeTransform {
  constructor(private subsidyService: SubsidyService) {}

  transform(value: number): string {
    return (
      this.subsidyService.typeList.find((type) => type.value === value)
        ?.text || '-'
    );
  }
}
