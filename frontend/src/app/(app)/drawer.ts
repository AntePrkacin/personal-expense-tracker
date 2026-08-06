// The drawer toggle's id: the one contract between the (app) layout, which
// renders the checkbox and both of its <label>s, and SidebarNav, which unchecks
// it after a navigation.
//
// Its own file rather than an export from either of those. The layout is a
// Server Component and SidebarNav is 'use client', so an import across that
// boundary does not hand over a string: every export of a client module turns
// into a client reference on the server. And SidebarNav importing it from the
// layout would be a cycle, because the layout already imports SidebarNav.
export const DRAWER_TOGGLE_ID = 'app-drawer';
