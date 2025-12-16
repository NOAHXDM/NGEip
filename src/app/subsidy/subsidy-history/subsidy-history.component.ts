import { AsyncPipe } from '@angular/common';
import { Component, Inject, Optional } from '@angular/core';
import { STEPPER_GLOBAL_OPTIONS } from '@angular/cdk/stepper';
import {
  MAT_DIALOG_DATA,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';
import { Observable } from 'rxjs';

import { SubsidyAuditTrail, SubsidyService } from '../../services/subsidy.service';
import { FirestoreTimestampPipe } from '../../pipes/firestore-timestamp.pipe';
import { UserNamePipe } from '../../pipes/user-name.pipe';
import { SubsidyStatusPipe } from '../../pipes/subsidy-status.pipe';

@Component({
  selector: 'app-subsidy-history',
  standalone: true,
  imports: [
    AsyncPipe,
    FirestoreTimestampPipe,
    UserNamePipe,
    SubsidyStatusPipe,
    MatDialogTitle,
    MatDialogContent,
    MatIconModule,
    MatStepperModule,
  ],
  templateUrl: './subsidy-history.component.html',
  styleUrl: './subsidy-history.component.scss',
  providers: [
    {
      provide: STEPPER_GLOBAL_OPTIONS,
      useValue: { displayDefaultIndicatorType: false },
    },
  ],
})
export class SubsidyHistoryComponent {
  auditTrailList$: Observable<SubsidyAuditTrail[]>;

  constructor(
    private subsidyService: SubsidyService,
    @Optional() @Inject(MAT_DIALOG_DATA) protected data: { id: string }
  ) {
    this.auditTrailList$ = this.subsidyService.getAuditTrail(this.data.id);
  }
}
