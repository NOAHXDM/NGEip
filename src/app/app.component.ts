import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { TimezoneService } from './services/timezone.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  timezoneService = inject(TimezoneService);
  timezoneOptions = this.timezoneService.getTimezoneOptions();
  timezoneSelected = new FormControl(0);

  ngOnInit() {
    const clientTimezoneOption = this.timezoneService.getCurrentTimezoneOption();
    this.timezoneSelected.setValue(clientTimezoneOption.offset);

    this.timezoneSelected.valueChanges.subscribe({
      next: (value) => {
        this.timezoneService.setClientTimezone(Number(value));
        // TODO: Smoothly update the UI instead of refreshing the entire webpage.
        location.reload();
      },
    });
  }
}
