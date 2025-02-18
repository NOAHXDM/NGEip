import { Component } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { User, UserService } from '../services/user.service';
import { Observable, take } from 'rxjs';

// export interface PeriodicElement {
//   name: string;
//   position: number;
//   weight: number;
//   symbol: string;
// }

// const ELEMENT_DATA: PeriodicElement[] = [
//   { position: 1, name: 'Hydrogen', weight: 1.0079, symbol: 'H' },
//   { position: 2, name: 'Helium', weight: 4.0026, symbol: 'He' },
//   { position: 3, name: 'Lithium', weight: 6.941, symbol: 'Li' },
//   { position: 4, name: 'Beryllium', weight: 9.0122, symbol: 'Be' },
//   { position: 5, name: 'Boron', weight: 10.811, symbol: 'B' },
//   { position: 6, name: 'Carbon', weight: 12.0107, symbol: 'C' },
//   { position: 7, name: 'Nitrogen', weight: 14.0067, symbol: 'N' },
//   { position: 8, name: 'Oxygen', weight: 15.9994, symbol: 'O' },
//   { position: 9, name: 'Fluorine', weight: 18.9984, symbol: 'F' },
//   { position: 10, name: 'Neon', weight: 20.1797, symbol: 'Ne' },
// ];

/**
 * @title Basic use of `<table mat-table>`
 */
@Component({
  selector: 'app-user-list',
  styleUrl: './user-list.component.scss',
  templateUrl: './user-list.component.html',
  standalone: true,
  imports: [MatTableModule],
})
export class UserListComponent {
  list$: Observable<User[]>;
  userArray: User[] = [];
  constructor(private userService: UserService) {
    this.list$ = this.userService.list$;
  }
  ngOnInit() {
    this.profile();
  }
  profile() {
    this.list$.pipe(take(1)).subscribe({
      next: (A) => {
        this.userArray = A;
        console.log(A);
      },
    });
  }
  displayedColumns: string[] = [
    'name',
    'email',
    'job-title',
    'job-rank',
    'wfh',
  ];
  // dataSource = ELEMENT_DATA;
}
