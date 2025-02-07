import { Component, Input } from '@angular/core';
import { LayoutComponent } from '../layout/layout.component';
import { User, UserService } from '../services/user.service';
import { Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [LayoutComponent],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
})
export class UserListComponent {
  @Input() user!: User;
}
