import { Component } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { SystemConfigService } from '../services/system-config.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-system-config',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './system-config.component.html',
  styleUrl: './system-config.component.scss',
})
export class SystemConfigComponent {
  configForm = new FormGroup({
    currentUsers: new FormControl(0, [Validators.min(0)]),
    maxUsers: new FormControl(1, [Validators.required, Validators.min(1)]),
    lastUpdated: new FormControl(''),
    initialSettlementYear: new FormControl('', [Validators.required]),
  });

  constructor(private systemConfigService: SystemConfigService) {
    this.configForm.patchValue(this.systemConfigService.license as any);
    this.configForm.get('currentUsers')?.disable();
    this.configForm.get('lastUpdated')?.disable();
  }
}
