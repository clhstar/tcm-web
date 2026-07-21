import accountCircleIcon from '@material-design-icons/svg/outlined/account_circle.svg?raw'
import addIcon from '@material-design-icons/svg/outlined/add.svg?raw'
import arrowBackIcon from '@material-design-icons/svg/outlined/arrow_back.svg?raw'
import assignmentIcon from '@material-design-icons/svg/outlined/assignment.svg?raw'
import attachFileIcon from '@material-design-icons/svg/outlined/attach_file.svg?raw'
import calendarMonthIcon from '@material-design-icons/svg/outlined/calendar_month.svg?raw'
import chatIcon from '@material-design-icons/svg/outlined/chat.svg?raw'
import chevronRightIcon from '@material-design-icons/svg/outlined/chevron_right.svg?raw'
import closeIcon from '@material-design-icons/svg/outlined/close.svg?raw'
import datasetIcon from '@material-design-icons/svg/outlined/dataset.svg?raw'
import descriptionIcon from '@material-design-icons/svg/outlined/description.svg?raw'
import editIcon from '@material-design-icons/svg/outlined/edit.svg?raw'
import errorIcon from '@material-design-icons/svg/outlined/error.svg?raw'
import factCheckIcon from '@material-design-icons/svg/outlined/fact_check.svg?raw'
import groupIcon from '@material-design-icons/svg/outlined/group.svg?raw'
import historyIcon from '@material-design-icons/svg/outlined/history.svg?raw'
import infoIcon from '@material-design-icons/svg/outlined/info.svg?raw'
import keyboardDoubleArrowLeftIcon from '@material-design-icons/svg/outlined/keyboard_double_arrow_left.svg?raw'
import keyboardDoubleArrowRightIcon from '@material-design-icons/svg/outlined/keyboard_double_arrow_right.svg?raw'
import libraryBooksIcon from '@material-design-icons/svg/outlined/library_books.svg?raw'
import logoutIcon from '@material-design-icons/svg/outlined/logout.svg?raw'
import manageSearchIcon from '@material-design-icons/svg/outlined/manage_search.svg?raw'
import medicalServicesIcon from '@material-design-icons/svg/outlined/medical_services.svg?raw'
import personIcon from '@material-design-icons/svg/outlined/person.svg?raw'
import personAddIcon from '@material-design-icons/svg/outlined/person_add.svg?raw'
import saveIcon from '@material-design-icons/svg/outlined/save.svg?raw'
import searchIcon from '@material-design-icons/svg/outlined/search.svg?raw'
import sendIcon from '@material-design-icons/svg/outlined/send.svg?raw'
import settingsIcon from '@material-design-icons/svg/outlined/settings.svg?raw'
import checkCircleIcon from '@material-design-icons/svg/outlined/check_circle.svg?raw'
import summarizeIcon from '@material-design-icons/svg/outlined/summarize.svg?raw'
import swapHorizIcon from '@material-design-icons/svg/outlined/swap_horiz.svg?raw'
import visibilityIcon from '@material-design-icons/svg/outlined/visibility.svg?raw'
import systemUpdateAltIcon from '@material-design-icons/svg/outlined/system_update_alt.svg?raw'

const iconSources = {
  accountCircle: accountCircleIcon,
  add: addIcon,
  arrowBack: arrowBackIcon,
  assignment: assignmentIcon,
  attachFile: attachFileIcon,
  calendarMonth: calendarMonthIcon,
  chat: chatIcon,
  chevronRight: chevronRightIcon,
  close: closeIcon,
  dataset: datasetIcon,
  description: descriptionIcon,
  edit: editIcon,
  error: errorIcon,
  factCheck: factCheckIcon,
  group: groupIcon,
  history: historyIcon,
  info: infoIcon,
  keyboardDoubleArrowLeft: keyboardDoubleArrowLeftIcon,
  keyboardDoubleArrowRight: keyboardDoubleArrowRightIcon,
  libraryBooks: libraryBooksIcon,
  logout: logoutIcon,
  manageSearch: manageSearchIcon,
  medicalServices: medicalServicesIcon,
  person: personIcon,
  personAdd: personAddIcon,
  save: saveIcon,
  search: searchIcon,
  send: sendIcon,
  settings: settingsIcon,
  checkCircle: checkCircleIcon,
  summarize: summarizeIcon,
  swapHoriz: swapHorizIcon,
  visibility: visibilityIcon,
  systemUpdateAlt: systemUpdateAltIcon,
} as const

export type MaterialIconName = keyof typeof iconSources

type MaterialIconProps = {
  name: MaterialIconName
  className?: string
  label?: string
}

export function MaterialIcon({ name, className = 'material-icon', label }: MaterialIconProps) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={className}
      role={label ? 'img' : undefined}
      dangerouslySetInnerHTML={{ __html: iconSources[name] }}
    />
  )
}
