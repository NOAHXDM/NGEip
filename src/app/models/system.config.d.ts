import { Timestamp, FieldValue} from "@angular/fire/firestore";

interface License {
  maxUsers: number;
  currentUsers: number;
  lastUpdated: Timestamp | FieldValue;
}